# auto_register: false
# frozen_string_literal: true

module Dither
  module Aspects
    module Transit
      module Providers
        module Trenord
          # What a board is being read against: the settings, and the single
          # instant the whole render is judged from.
          Moment = Data.define :settings, :at do
            def local(other = at) = settings.now(other)

            def cutoff = settings.departs_at(at)
          end
        end
      end
    end
  end
end
