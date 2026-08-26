# auto_register: false
# frozen_string_literal: true

require "functionable"
require "sanitize"

module Dither
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Turns Trenord's service notices into plain, language specific text.
          module Alerts
            extend Functionable

            def call payload, language
              Array(Hash(payload)["hafas_alerts"]).map do |alert|
                Alert[
                  severity: alert["severity"] || "INFO",
                  title: text(alert["title_#{language}"] || alert["title_en"]),
                  message: text(alert["message_#{language}"] || alert["message_en"])
                ]
              end
            end

            # Alert bodies are HTML. A screen wants a sentence.
            def text(value) = Sanitize.fragment(String(value)).gsub(/\s+/, " ").strip
          end
        end
      end
    end
  end
end
