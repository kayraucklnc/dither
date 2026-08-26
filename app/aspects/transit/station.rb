# auto_register: false
# frozen_string_literal: true

module Dither
  module Aspects
    module Transit
      # A provider agnostic station.
      Station = Data.define :code,
                            :name,
                            :city,
                            :region,
                            :country,
                            :platforms,
                            :latitude,
                            :longitude do
        def initialize code:,
                       name:,
                       city: nil,
                       region: nil,
                       country: nil,
                       platforms: [],
                       latitude: nil,
                       longitude: nil
          super
        end

        def to_h_for_json
          {
            "code" => code,
            "name" => name,
            "city" => city,
            "region" => region,
            "country" => country,
            "platforms" => platforms
          }
        end
      end
    end
  end
end
