# frozen_string_literal: true

require "refinements/time"

module Dither
  module Structs
    # The extension struct.
    class Extension < DB::Struct
      WEEK = %w[sunday monday tuesday wednesday thursday friday saturday].freeze

      using Refinements::Time

      def export_attributes
        {
          name:,
          label:,
          description:,
          mode:,
          kind:,
          tags:,
          static_body:,
          fields:,
          data:,
          interval:,
          unit:,
          days:,
          last_day_of_month:,
          start_at: start_at.rfc_3339
        }
      end

      # ---- Layout -------------------------------------------------------
      #
      # Where this extension is allowed to sit. `template` is the full page;
      # `variants` holds the other shapes its author designed for. A shape with
      # no template is a shape this extension cannot occupy, and the composer
      # will not offer it there rather than scaling the full page down to fit.

      def templates
        declared = Hash(variants).transform_keys(&:to_s)
        declared[Composition::DEFAULT_SHAPE] = template unless String(template).empty?

        Composition.shape_ids.filter_map { |id| [id, declared[id]] if declared[id] }.to_h
      end

      def shape_ids = templates.keys

      def shapes = shape_ids.filter_map { Composition.shape it }

      def supports?(shape_id) = templates.key? shape_id.to_s

      def template_for(shape_id) = templates[shape_id.to_s]

      # Arrangements this extension could fill on its own, in every slot.
      def layouts = Composition.layouts_satisfiable_by shape_ids

      def variant_count = shape_ids.size

      # ---- Sample data ---------------------------------------------------
      #
      # What this extension renders before it has ever fetched anything. Used
      # only by previews, and only when there is no real data - a device is
      # never served sample data.

      def sample_data = Hash(sample).transform_keys(&:to_s)

      def sample? = sample_data.any?

      def liquid_attributes
        all_fields = Array fields

        values = all_fields.each.with_object({}) do |item, all|
          key, value = item.values_at "keyname", "default"
          all[key] = Hash(data).dig("values", key) || value
        end

        {"label" => label, "fields" => all_fields, "values" => values, "data" => data}
      end

      def screen_label = "Extension #{label}"

      def screen_name = "extension-#{name}"

      def screen_attributes = {extension_id: id, label: screen_label, name: screen_name, mode:}

      def to_cron croner: Aspects::Croner, week: WEEK
        case self
          in unit: "week" then croner.call days.map { week.index it }, unit, time: start_at
          in unit: "month", last_day_of_month: true
            croner.call "#{interval}L", unit, time: start_at
          else croner.call interval, unit, time: start_at
        end
      end

      def to_schedule
        return [screen_name, Core::EMPTY_HASH] if unit == "none"

        [
          screen_name,
          {
            cron: to_cron,
            class: Dither::Jobs::Batches::Extension.name,
            args: [id],
            description: "The #{label} extension update schedule."
          }
        ]
      end
    end
  end
end
