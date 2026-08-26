# frozen_string_literal: true

require "refinements/hash"

module Dither
  module Structs
    # The device sensor struct.
    class DeviceSensor < DB::Struct
      using Refinements::Hash

      def liquid_attributes
        {device_id:, make:, model:, kind:, value:, unit:, source:, created_at:}.stringify_keys!
      end
    end
  end
end
