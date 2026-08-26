# frozen_string_literal: true

require "core"

module Terminus
  module Views
    module Devices
      # The edit view.
      class Edit < View
        expose :models
        expose :playlists
        decorate :device
        expose :fields, default: Core::EMPTY_HASH
        expose :errors, default: Core::EMPTY_HASH
      end
    end
  end
end
