# auto_register: false
# frozen_string_literal: true

module Dither
  module Aspects
    module Extensions
      # Reads per-shape templates out of a file set.
      #
      # An extension declares the shapes it can occupy by writing a template for
      # each one - there is no separate list to keep in sync, so a variant
      # cannot be declared without being designed or designed without being
      # declared. The full-page template is the extension's `template` column
      # and lives at the root; everything under templates/ is an extra shape.
      #
      #   template.html.liquid              -> the full page
      #   templates/half_width.html.liquid  -> the half-width variant
      #
      # Shape names come from Dither::Composition. Anything else is reported
      # rather than dropped: a typo should be a loud failure, not an extension
      # that mysteriously refuses to sit in half a screen.
      module Variants
        DIRECTORY = "templates"
        SUFFIX = ".html.liquid"
        PATTERN = %r(\A#{DIRECTORY}/(?<shape>[a-z_]+)#{Regexp.escape SUFFIX}\z).freeze

        Result = Data.define :variants, :problems do
          def valid? = problems.empty?
        end

        # Answers variants and problems for a hash of relative path => content.
        def self.call entries
          variants = {}
          problems = []

          Hash(entries).each do |path, content|
            shape = PATTERN.match(path.to_s)&.[](:shape)
            next unless shape

            problem = problem_for path, shape, content
            problem ? problems.push(problem) : variants.store(shape, content)
          end

          Result[variants: sort(variants), problems:]
        end

        # The inverse, for export: variants back into zip entries.
        def self.entries_for variants
          sort(Hash(variants)).to_h { |shape, content| ["#{DIRECTORY}/#{shape}#{SUFFIX}", content] }
        end

        def self.problem_for path, shape, content
          if shape == Composition::DEFAULT_SHAPE
            "#{path}: the full page variant belongs in template#{SUFFIX}, not #{DIRECTORY}/."
          elsif !Composition.shape?(shape)
            "#{path}: unknown shape #{shape.inspect}. Known shapes: #{Composition.shape_ids.join ", "}."
          elsif String(content).strip.empty?
            "#{path}: empty."
          end
        end

        # Keeps stored keys in the vocabulary's own order so the UI and the
        # export are stable regardless of filesystem or zip ordering.
        def self.sort variants
          Composition.shape_ids.filter_map { |id| [id, variants[id]] if variants.key? id }.to_h
        end

        private_class_method :problem_for, :sort
      end
    end
  end
end
