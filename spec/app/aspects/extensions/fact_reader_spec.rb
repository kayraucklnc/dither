# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Extensions::FactReader, :db do
  subject(:reader) { described_class.new }

  let :calendar do
    Factory[
      :extension,
      label: "Calendar",
      facts: [
        {"key" => "next_meeting_in", "label" => "Next meeting starts in",
         "type" => "duration", "path" => "source_1.next.minutes_until"},
        {"key" => "next_meeting_location", "label" => "Next meeting location",
         "type" => "text", "path" => "source_1.next.location"}
      ],
      sample: {"source_1" => {"next" => {"minutes_until" => 20, "location" => "Milano Centrale"}}}
    ]
  end

  describe "#call" do
    it "falls back to the sample before anything has been fetched" do
      expect(reader.call(calendar)).to eq(
        "next_meeting_in" => 20,
        "next_meeting_location" => "Milano Centrale"
      )
    end

    it "prefers what was actually fetched" do
      Factory[:extension_exchange, extension_id: calendar.id,
              data: {"source_1" => {"next" => {"minutes_until" => 5, "location" => "Home"}}}]

      expect(reader.call(calendar)).to include("next_meeting_in" => 5)
    end
  end
end
