# frozen_string_literal: true

require "hanami/view"
require "initable"

module Dither
  module Views
    module Parts
      # The extension presenter.
      class Extension < Hanami::View::Part
        include Initable[json_formatter: Aspects::JSONFormatter]

        def alpine_tags
          Array(tags).map { %('#{it}') }
                     .join(",")
                     .then { "[#{it}]" }
        end

        def formatted_data = json_formatter.call data

        def formatted_days = days ? days.join(",") : ""

        def formatted_fields = json_formatter.call fields

        def formatted_start_at
          start_at ? start_at.strftime("%Y-%m-%dT%H:%M:%S") : "2025-01-01T00:00:00"
        end

        # ---- What this extension is, in a sentence -------------------------

        KINDS = {
          "poll" => "Fetches from an API on a schedule",
          "webhook" => "Waits for something to post to it",
          "static" => "Renders fixed content, no fetching",
          "transit" => "Departure boards from a transit provider",
          "image" => "Renders an image",
          "secure" => "Fetches with stored credentials"
        }.freeze

        def kind_description = KINDS.fetch kind, kind.to_s.capitalize

        def schedule_description
          return "Never refreshes on its own" if unit == "none"
          return "Every minute" if interval == 1 && unit == "minute"

          "Every #{interval} #{unit}#{"s" unless interval == 1}"
        end

        # ---- Whether it is actually working --------------------------------
        #
        # The question everyone has about an extension is "is it getting data",
        # and until now the page answered it nowhere.

        def data_state
          return "static" if kind == "static"
          return "live" if live_data?
          return "sample" if sample?

          "empty"
        end

        def data_description
          case data_state
            when "static" then "No data needed"
            when "live" then "Live data"
            when "sample" then "Showing sample data"
            else "No data yet"
          end
        end

        def live_data?
          Hash(data).any? { |_key, value| !value.nil? && !(value.respond_to?(:empty?) && value.empty?) }
        end

        # ---- Where it can go -----------------------------------------------

        def shape_labels = shapes.map(&:label)

        def thumbnail_path routes, model
          return nil unless model

          "#{routes.path :scene_preview}?layout=full&slots[main]=#{id}&model_id=#{model.id}"
        end

        def formatted_static_body = json_formatter.call static_body
      end
    end
  end
end
