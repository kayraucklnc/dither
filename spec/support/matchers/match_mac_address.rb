# frozen_string_literal: true

RSpec::Matchers.define :match_mac_address do
  match do |actual|
    actual.match?(/\A[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}:[0-9A-F]{2}\Z/)
  end
end
