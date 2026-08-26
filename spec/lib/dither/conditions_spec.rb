# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Conditions do
  let(:device) { Struct.new(:charging, :battery_percentage, :synced_at).new(false, 80.0, Time.now) }

  describe ".holds?" do
    it "always holds for the default kind" do
      expect(described_class.holds?("always", device, {})).to be true
    end

    it "refuses a kind it does not recognise" do
      expect(described_class.holds?("nonsense", device, {})).to be false
    end

    it "holds inside a time window" do
      now = Time.new 2026, 1, 1, 8, 0, 0

      expect(described_class.holds?("time_between", device, {"from" => "07:00", "to" => "09:30"}, now:))
        .to be true
    end

    it "does not hold outside a time window" do
      now = Time.new 2026, 1, 1, 10, 0, 0

      expect(described_class.holds?("time_between", device, {"from" => "07:00", "to" => "09:30"}, now:))
        .to be false
    end

    it "holds inside a window that wraps past midnight" do
      now = Time.new 2026, 1, 1, 23, 30, 0

      expect(described_class.holds?("time_between", device, {"from" => "22:00", "to" => "06:00"}, now:))
        .to be true
    end

    it "holds when the battery is below the threshold" do
      low = Struct.new(:charging, :battery_percentage).new(false, 12.0)

      expect(described_class.holds?("battery_below", low, {"percent" => 20})).to be true
    end

    it "does not hold while charging, however low the battery" do
      low = Struct.new(:charging, :battery_percentage).new(true, 2.0)

      expect(described_class.holds?("battery_below", low, {"percent" => 20})).to be false
    end

    it "holds on a listed weekday" do
      thursday = Time.new 2026, 1, 1, 12, 0, 0

      expect(described_class.holds?("weekday", device, {"days" => %w[thursday]}, now: thursday))
        .to be true
    end
  end

  describe ".describe" do
    it "reads as a sentence fragment" do
      expect(described_class.describe("time_between", {"from" => "07:00", "to" => "09:30"}))
        .to eq "between 07:00 and 09:30"
    end
  end

  describe "kinds" do
    it "declares fields for every kind that needs settings" do
      described_class::ALL.each do |kind|
        expect(kind.fields).to all(respond_to(:key))
      end
    end
  end
end
