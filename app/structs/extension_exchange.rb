# frozen_string_literal: true

module Dither
  module Structs
    # The extension exchange struct.
    class ExtensionExchange < DB::Struct
      def export_attributes = {headers:, verb:, body:, template:}
    end
  end
end
