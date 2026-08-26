# frozen_string_literal: true

module Dither
  # What an extension can be asked about, and how to compare it.
  #
  # A fact is a declared name, a type, and a path into the extension's own
  # fetched data. That is the whole contract: an extension that publishes
  # "next_meeting_in" gets a trigger for it, and the rule engine never learns
  # what a meeting is.
  module Facts
    TYPES = %w[duration number text boolean].freeze

    # Operators are declared per type so the editor can offer only the ones
    # that make sense. Asking whether a duration "contains" something is not a
    # question, and offering it invites rules that can never be true.
    Operator = Data.define :id, :label, :arity do
      def value? = arity == 1
    end

    OPERATORS = [
      Operator[id: "lt", label: "is less than", arity: 1],
      Operator[id: "lte", label: "is at most", arity: 1],
      Operator[id: "gt", label: "is more than", arity: 1],
      Operator[id: "gte", label: "is at least", arity: 1],
      Operator[id: "eq", label: "is", arity: 1],
      Operator[id: "neq", label: "is not", arity: 1],
      Operator[id: "contains", label: "contains", arity: 1],
      Operator[id: "present", label: "has any value", arity: 0],
      Operator[id: "absent", label: "is empty", arity: 0]
    ].freeze

    OPERATORS_BY_ID = OPERATORS.to_h { [it.id, it] }.freeze

    OPERATORS_FOR = {
      "duration" => %w[lt lte gt gte present absent],
      "number" => %w[lt lte gt gte eq neq present absent],
      "text" => %w[eq neq contains present absent],
      "boolean" => %w[eq present absent]
    }.freeze

    # One declared fact.
    Fact = Data.define :key, :label, :type, :path, :unit do
      def self.from attributes
        values = Hash(attributes).transform_keys(&:to_s)

        new(
          key: values["key"].to_s,
          label: values["label"] || values["key"].to_s.tr("_", " ").capitalize,
          type: TYPES.include?(values["type"]) ? values["type"] : "text",
          path: values["path"].to_s,
          unit: values["unit"]
        )
      end

      def operators = OPERATORS_FOR.fetch(type, []).filter_map { Facts.operator it }

      def valid? = !key.empty? && !path.empty?
    end

    def self.operator(id) = OPERATORS_BY_ID.fetch id.to_s, nil

    def self.declared(extension) = Array(extension.facts).map { Fact.from it }.select(&:valid?)

    def self.find extension, key
      declared(extension).find { it.key == key.to_s }
    end

    # Digs a fact out of whatever the extension last fetched. A path is dotted,
    # and a missing step answers nil rather than raising: an extension that has
    # not fetched yet has no facts, which is a real state and not an error.
    # A path is dotted, and a numeric step indexes an array: the first
    # departure is "transit.departures.0.delay". A missing step answers nil
    # rather than raising, because an extension that has not fetched yet has no
    # facts, which is a real state and not an error.
    def self.value data, path
      path.to_s.split(".").reduce(data) do |current, step|
        case current
          when Hash then current[step]
          when Array then step.match?(/\A\d+\z/) ? current[step.to_i] : nil
          else break nil
        end
      end
    end

    # rubocop:todo-next Metrics/CyclomaticComplexity
    def self.compare actual, operator_id, expected
      case operator_id.to_s
        when "present" then !blank?(actual)
        when "absent" then blank?(actual)
        when "contains" then actual.to_s.downcase.include? expected.to_s.downcase
        when "eq" then actual.to_s.casecmp?(expected.to_s)
        when "neq" then !actual.to_s.casecmp?(expected.to_s)
        else numeric_compare actual, operator_id, expected
      end
    end

    def self.numeric_compare actual, operator_id, expected
      return false if blank? actual

      left = Float actual, exception: false
      right = Float expected, exception: false

      return false unless left && right

      case operator_id.to_s
        when "lt" then left < right
        when "lte" then left <= right
        when "gt" then left > right
        when "gte" then left >= right
        else false
      end
    end

    def self.blank?(value) = value.nil? || (value.respond_to?(:empty?) && value.empty?)

    private_class_method :numeric_compare
  end
end
