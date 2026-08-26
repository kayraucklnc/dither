# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Transit::Settings do
  subject(:settings) { described_class[origin: "MILANO CERTOSA", timezone: "Europe/Rome"] }

  let(:clock) { Time.utc 2026, 8, 27, 6, 0, 0 }

  describe "#label" do
    it "answers origin and destination" do
      board = settings.with destination: "MILANO CADORNA"

      expect(board.label).to eq("MILANO CERTOSA to MILANO CADORNA")
    end

    it "answers title when supplied" do
      expect(settings.with(title: "Commute").label).to eq("Commute")
    end
  end

  describe "#now" do
    it "answers local wall clock at origin" do
      expect(settings.now(clock).strftime("%H:%M")).to eq("08:00")
    end

    it "falls back to UTC for an unknown zone" do
      expect(settings.with(timezone: "Mars/Olympus").now(clock).strftime("%H:%M")).to eq("06:00")
    end
  end

  describe "#departs_at" do
    it "answers now when there is no lead time" do
      expect(settings.departs_at(clock).strftime("%H:%M")).to eq("08:00")
    end

    it "answers a later time with lead time" do
      expect(settings.with(lead_time: 30).departs_at(clock).strftime("%H:%M")).to eq("08:30")
    end
  end
end
