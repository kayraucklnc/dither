# frozen_string_literal: true

require "date"
require "initable"
require "time"

module Terminus
  module Aspects
    module Transit
      module Providers
        module Trenord
          # Turns one journey planner solution into one departure.
          #
          # Answers nil when the train is not worth showing: no legs at all, or
          # already gone by the time the board is read.
          class DepartureBuilder
            include Initable[
              clock: proc { Terminus::Aspects::Transit::Clock },
              origin_stop: proc { Terminus::Aspects::Transit::Providers::Trenord::OriginStop }
            ]

            def call solution, moment
              return if Array(solution["journey_list"]).empty?

              stop = origin_stop.call solution
              return if departed? stop, moment

              build solution, stop, offset(stop, moment)
            end

            private

            def build solution, stop, day_offset
              Departure[
                **identity(solution),
                **timing(solution, stop),
                platform: presence(stop["platform"]),
                platform_actual: stop["is_actual_platform"] == true,
                day_offset:
              ]
            end

            def identity solution
              train = train_for solution

              train_identity(train, solution).merge journey_identity(solution)
            end

            def train_identity train, solution
              {
                line: train["line"] || train["train_category"],
                number: train["train_name"] || train["train_id"],
                direction: train["direction"],
                cancelled: cancelled?(solution, train),
                live: train["has_live_info"] == true
              }
            end

            def journey_identity solution
              {
                arrival: clock.call(solution["arr_time"]),
                duration: clock.duration(solution["duration"]),
                changes: solution["change"].to_i
              }
            end

            def timing solution, stop
              reported = delay_for solution
              scheduled = clock.call solution["dep_time"]
              expected = expected stop, scheduled, reported

              {scheduled:, expected:, delay: delay(reported, scheduled, expected)}
            end

            def train_for(solution) = Hash Hash(Array(solution["journey_list"]).first)["train"]

            # Trenord publishes an actual time once a train is running and an
            # estimate before that. Either beats adding the delay by hand.
            def expected stop, scheduled, reported
              live = Hash stop["actual_data"]
              actual = clock.call(live["dep_actual_time"]) || clock.call(live["dep_estimated_time"])
              return actual if actual

              reported.zero? ? scheduled : clock.shift(scheduled, reported)
            end

            def delay_for solution
              [solution["delay"], train_for(solution)["delay"]].compact.first.to_i
            end

            # A train can carry an estimated time without a reported delay. The
            # board would then show a later clock while claiming to be on time,
            # so the gap becomes the delay.
            def delay reported, scheduled, expected
              return reported if reported.positive?
              return 0 unless scheduled && expected

              clock.between scheduled, expected
            end

            # Trenord's own day offset is relative to the solution's date, which
            # is not the day the board is being looked at. Counting calendar
            # days in the station's own zone is the only reading that survives
            # a query made just before midnight.
            def offset stop, moment
              iso = stop["dep_date_time"]
              return 0 unless iso

              (moment.local(Time.iso8601(iso)).to_date - moment.local.to_date).to_i
            rescue ArgumentError
              0
            end

            # HAFAS likes to include the train that just left. Nobody can catch
            # it, and lead time exists precisely to say how much earlier than
            # that the board should stop being useful.
            def departed? stop, moment
              iso = stop["dep_date_time"]
              return false unless iso

              Time.iso8601(iso) < moment.cutoff
            rescue ArgumentError
              false
            end

            def cancelled? solution, train
              solution["cancelled"] == true || train["status"] == "S"
            end

            def presence value
              stripped = String(value).strip
              stripped.empty? ? nil : stripped
            end
          end
        end
      end
    end
  end
end
