# auto_register: false
# frozen_string_literal: true

require "functionable"

module Dither
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Finds the stop a journey actually starts from.
          #
          # Trains carrying live data ship their whole run, so the stop you
          # board at can be anywhere in the list. Matching on station code is
          # the only reliable way in; position is not.
          module OriginStop
            extend Functionable

            def call solution
              leg = Array(Hash(solution)["journey_list"]).first
              return Core::EMPTY_HASH unless leg

              stops = Array leg["pass_list"]
              code = Hash(Hash(solution)["dep_station"])["station_id"]

              Hash(stops.find { Hash(it["station"])["station_id"] == code } || stops.first)
            end
          end
        end
      end
    end
  end
end
