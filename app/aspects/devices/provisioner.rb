# frozen_string_literal: true

require "core"
require "dry/monads"
require "pipeable"

module Dither
  module Aspects
    module Devices
      # Handles the setup and default configuration of new devices.
      class Provisioner
        include Deps[
          "aspects.devices.defaulter",
          "aspects.screens.interrupts.welcome",
          repository: "repositories.device"
        ]

        include Dry::Monads[:result]
        include Pipeable

        def call(mac_address: MACAddressBuilder.call, **)
          device = repository.find_by(mac_address:)

          return maybe_redact_api_key device if device

          process(mac_address, **)
        end

        private

        def maybe_redact_api_key device
          if device.firmware_reset
            repository.update device.id, firmware_reset: false
          else
            device.define_singleton_method(:api_key) { Core::EMPTY_STRING }
          end

          Success device
        end

        def process(mac_address, **)
          cached_device = nil

          # A new device gets a welcome screen and nothing else. What it shows
          # after that is decided by rules, which are the owner's to write -
          # inventing one here would make an unconfigured device look
          # configured.
          pipe(
            create(mac_address, **),
            fmap { cached_device = it },
            bind { |device| welcome.call device },
            fmap { cached_device }
          )
        end

        def create(mac_address, **)
          Success repository.create(defaulter.call.merge!(mac_address:, **))
        rescue ROM::SQL::NotNullConstraintError => error
          Failure "#{error.message.match(/ERROR:  (.+)\n/)[1].capitalize}."
        rescue ROM::SQL::ForeignKeyConstraintError => error
          Failure error.message.sub(/.+DETAIL:  /m, "").strip
        end

      end
    end
  end
end
