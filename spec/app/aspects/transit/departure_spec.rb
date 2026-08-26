# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Transit::Departure do
  subject(:departure) { described_class[line: "S5", number: "11881", scheduled: "22:43"] }

  describe "#status" do
    it "answers scheduled without live information" do
      expect(departure.status).to eq("SCHEDULED")
    end

    it "answers on time with live information" do
      expect(departure.with(live: true).status).to eq("ON TIME")
    end

    it "answers delay when late" do
      expect(departure.with(delay: 5).status).to eq("+5")
    end

    it "answers cancelled ahead of delay" do
      expect(departure.with(delay: 5, cancelled: true).status).to eq("CANCELLED")
    end
  end

  describe "#liquid_attributes" do
    it "answers keys a template can read" do
      expect(departure.liquid_attributes).to include(
        "line" => "S5",
        "number" => "11881",
        "scheduled" => "22:43",
        "delayed" => false,
        "direct" => true,
        "status" => "SCHEDULED"
      )
    end
  end
end
