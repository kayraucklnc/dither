# auto_register: false
# frozen_string_literal: true

module Terminus
  module Aspects
    module Transit
      # A service alert as published by a provider.
      Alert = Data.define :severity, :title, :message do
        def initialize severity: "INFO", title: nil, message: nil
          super
        end

        def liquid_attributes = {"severity" => severity, "title" => title, "message" => message}
      end
    end
  end
end
