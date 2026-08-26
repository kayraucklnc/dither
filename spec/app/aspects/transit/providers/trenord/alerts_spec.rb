# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Transit::Providers::Trenord::Alerts do
  subject(:alerts) { described_class }

  let :payload do
    {
      "hafas_alerts" => [
        {
          "severity" => "WARNING",
          "title_en" => "Notice",
          "title_it" => "Avviso",
          "message_en" => "<div><strong>Bus </strong>replacement\n  between stops.</div>",
          "message_it" => "<div>Autobus sostitutivi.</div>"
        }
      ]
    }
  end

  describe ".call" do
    it "answers plain text in the chosen language" do
      expect(alerts.call(payload, "en").first).to have_attributes(
        severity: "WARNING",
        title: "Notice",
        message: "Bus replacement between stops."
      )
    end

    it "answers Italian when asked" do
      expect(alerts.call(payload, "it").first.message).to eq("Autobus sostitutivi.")
    end

    it "falls back to English for a missing translation" do
      expect(alerts.call(payload, "de").first.title).to eq("Notice")
    end

    it "answers empty without alerts" do
      expect(alerts.call({}, "en")).to eq([])
    end
  end
end
