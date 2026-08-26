# auto_register: false
# frozen_string_literal: true

module Terminus
  module Contracts
    module Rules
      AttachmentSize = lambda do |max = 512_000|
        next unless value
        next if value[:tempfile].size <= max

        key.failure "must be less than #{Views::Helpers.size max}"
      end
    end
  end
end
