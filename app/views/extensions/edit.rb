# frozen_string_literal: true

require "core"

module Dither
  module Views
    module Extensions
      # The edit view.
      class Edit < View
        include Deps[
          model_repository: "repositories.model",
          device_repository: "repositories.device",
          exchange_repository: "repositories.extension_exchange"
        ]

        # Falls back to any model. The named one is an upstream default that a
        # self-hosted install may never have had, and a missing preview model
        # should not take the whole edit page down.
        expose(:default_model) do
          model_repository.find_by(name: "og_plus") || model_repository.all.first
        end
        expose(:models) { model_repository.all.map { [it.label, it.id] } }
        expose(:devices) { device_repository.all.map { [it.label, it.id] } }

        decorate :exchanges do |extension:|
          exchange_repository.where extension_id: extension.id
        end

        decorate :extension
        expose :fields, default: Core::EMPTY_HASH
        expose :errors, default: Core::EMPTY_HASH
      end
    end
  end
end
