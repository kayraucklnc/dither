# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Transit::Providers::Trenord::Provider do
  subject :provider do
    described_class.new client:, normalizer:, registry:, clock: -> { now }
  end

  include Dry::Monads[:result]

  let(:now) { Time.utc 2026, 8, 26, 20, 30, 0 }
  let(:client) { instance_double Dither::Aspects::Transit::Providers::Trenord::Client }
  let(:registry) { instance_double Dither::Aspects::Transit::Providers::Trenord::Registry }
  let(:normalizer) { -> payload, settings { [payload, settings] } }

  let :settings do
    Dither::Aspects::Transit::Settings[
      origin: "MILANO CERTOSA",
      destination: "MILANO CADORNA",
      timezone: "Europe/Rome",
      limit: 2
    ]
  end

  def solution number, iso
    {
      "date" => "20260826",
      "dep_time" => "22:43:00",
      "dep_station" => {"station_id" => "S01640"},
      "journey_list" => [leg(number, iso)]
    }
  end

  def leg number, iso
    {
      "train" => {"train_name" => number},
      "pass_list" => [{"station" => {"station_id" => "S01640"}, "dep_date_time" => iso}]
    }
  end

  describe "#board" do
    it "asks the client for the settings' route and time" do
      allow(client).to receive(:journeys).and_return Success({"solutions" => []})
      provider.board settings

      expect(client).to have_received(:journeys).with(
        origin: "MILANO CERTOSA",
        destination: "MILANO CADORNA",
        departs_at: settings.departs_at(now),
        transfers: 1,
        language: "en"
      )
    end

    it "stops after one page when there are enough journeys" do
      payload = {
        "solutions" => [
          solution("1", "2026-08-26T20:43:00.000Z"),
          solution("2", "2026-08-26T20:53:00.000Z")
        ]
      }
      allow(client).to receive(:journeys).and_return Success(payload)
      provider.board settings

      expect(client).to have_received(:journeys).once
    end

    it "walks forward when a page is not enough" do
      first = {"solutions" => [solution("1", "2026-08-26T20:43:00.000Z")]}
      second = {"solutions" => [solution("2", "2026-08-26T20:53:00.000Z")]}
      allow(client).to receive(:journeys).and_return Success(first), Success(second)

      payload, = provider.board(settings).value!

      expect(payload["solutions"].size).to eq(2)
    end

    it "starts the next page after the last journey it saw" do
      first = {"solutions" => [solution("1", "2026-08-26T20:43:00.000Z")]}
      allow(client).to receive(:journeys).and_return Success(first), Success({"solutions" => []})
      provider.board settings

      expect(client).to have_received(:journeys).with(
        hash_including(departs_at: Time.iso8601("2026-08-26T20:43:00.000Z") + 60)
      )
    end

    it "de-duplicates journeys repeated across pages" do
      page = {"solutions" => [solution("1", "2026-08-26T20:43:00.000Z")]}
      allow(client).to receive(:journeys).and_return Success(page)

      payload, = provider.board(settings).value!

      expect(payload["solutions"].size).to eq(1)
    end

    it "answers failure when the client fails" do
      allow(client).to receive(:journeys).and_return Failure("Trenord answered 503.")

      expect(provider.board(settings)).to be_failure("Trenord answered 503.")
    end
  end

  describe "#stations" do
    it "delegates to the registry" do
      allow(registry).to receive(:call).and_return Success([])
      provider.stations query: "milano", limit: 5

      expect(registry).to have_received(:call).with(query: "milano", limit: 5)
    end
  end
end
