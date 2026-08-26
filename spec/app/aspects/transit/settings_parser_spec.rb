# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Transit::SettingsParser do
  subject(:parser) { described_class.new }

  let :values do
    {
      "country" => "it",
      "city" => "milan",
      "provider" => "trenord",
      "origin" => "MILANO CERTOSA",
      "destination" => "MILANO CADORNA",
      "lead_time" => "30",
      "limit" => "8"
    }
  end

  describe "#call" do
    it "answers settings with coerced values" do
      expect(parser.call(values).value!).to have_attributes(
        origin: "MILANO CERTOSA",
        destination: "MILANO CADORNA",
        lead_time: 30,
        limit: 8
      )
    end

    it "answers the city's time zone" do
      expect(parser.call(values).value!.timezone).to eq("Europe/Rome")
    end

    it "answers defaults for everything unsupplied" do
      expect(parser.call({"origin" => "MILANO CERTOSA"}).value!).to have_attributes(
        country: "it",
        city: "milan",
        provider: "trenord",
        lead_time: 0,
        limit: 5,
        language: "en",
        show_platform: true,
        hide_cancelled: false
      )
    end

    it "answers failure without an origin" do
      expect(parser.call({})).to be_failure("Transit origin is missing.")
    end

    it "answers failure for an out of range limit" do
      expect(parser.call(values.merge("limit" => "50"))).to be_failure(
        "Transit limit must be less than or equal to 20."
      )
    end

    it "answers failure for an unsupported language" do
      expect(parser.call(values.merge("language" => "fr"))).to be_failure(
        "Transit language must be one of: en, it."
      )
    end

    it "answers failure for an unsupported city" do
      expect(parser.call(values.merge("city" => "rome"))).to be_failure(
        "Unsupported transit provider: it/rome/trenord."
      )
    end
  end
end
