# frozen_string_literal: true

require "yaml"

module Dither
  module Aspects
    module Extensions
      # Exports extension attributes for sharing.
      class Exporter
        include Deps[
          :settings,
          "aspects.zipper",
          exchange_repository: "repositories.extension_exchange"
        ]

        def call extension
          # Variants ship as their own files so the export is byte-identical
          # to what a bundled extension looks like on disk, and so a designer
          # can open one shape without wading through the others.
          manifest = {
            "configuration.yml" => configuration_for(extension),
            "template.html.liquid" => extension.template,
            **Variants.entries_for(extension.variants)
          }

          zipper.call manifest
        end

        private

        def configuration_for extension
          YAML.dump build_configuration(extension), stringify_names: true
        end

        def build_configuration extension
          exchange_repository.where(extension_id: extension.id)
                             .map(&:export_attributes)
                             .then do |exchanges|
                               {
                                 version: settings.git_tag,
                                 **extension.export_attributes,
                                 exchanges:
                               }
                             end
        end
      end
    end
  end
end
