# frozen_string_literal: true

require "dry/monads"
require "inspectable"

module Terminus
  module Aspects
    module Screens
      # Saves content as image to temporary file path for optional processing.
      class TempPather
        include Deps["aspects.sanitizer", "aspects.screens.shoter", "aspects.screens.converter"]
        include Dry::Monads[:result]
        include Inspectable[sanitizer: :type]

        def call(mold, &) = Pathname.mktmpdir { process mold, it, & }

        private

        def process mold, directory
          mold.output_path = directory.join mold.file_name

          capture_input(mold, directory).bind { converter.call mold }
                                        .bind { |path| block_given? ? yield(path) : path }
        end

        def capture_input mold, directory
          content = sanitizer.call document_for(mold.content)

          shoter.call(content, directory.join("input.png"), **mold.viewport)
                .fmap { |path| mold.input_path = path }
        end

        # Designs are stored as bare HTML fragments and reach Chromium with no
        # stylesheet at all, so they render as unstyled text. Extension screens
        # arrive as complete documents and are passed through untouched.
        def document_for content
          return content if content.to_s.match?(/<html[\s>]/i)

          <<~HTML
            <!DOCTYPE html>
            <html lang="en">
              <head>
                <meta charset="utf-8">
                <style>#{Terminus::ScreenFramework.css}</style>
              </head>
              <body>#{content}</body>
            </html>
          HTML
        end
      end
    end
  end
end
