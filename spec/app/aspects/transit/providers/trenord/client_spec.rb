# frozen_string_literal: true

require "hanami_helper"
require "http"

RSpec.describe Terminus::Aspects::Transit::Providers::Trenord::Client do
  subject(:client) { described_class.new http:, cipher: }

  include Dry::Monads[:result]

  let(:http) { class_double HTTP }
  let(:cipher) { -> body { Success "decrypted: #{body}" } }
  let(:departs_at) { Time.utc 2026, 8, 26, 22, 30, 0 }

  before { allow(http).to receive_messages(headers: http, follow: http) }

  def respond body, status: 200, headers: {}
    HTTP::Response.new headers:, body:, status:, version: 1.0
  end

  describe "#journeys" do
    before { allow(http).to receive(:get).and_return respond("ciphertext") }

    it "answers decrypted content" do
      result = client.journeys(origin: "A", destination: "B", departs_at:)

      expect(result).to be_success("decrypted: ciphertext")
    end

    it "sends the route, date, and hour Trenord expects" do
      client.journeys(origin: "MILANO CERTOSA", destination: "MILANO CADORNA", departs_at:)

      expect(http).to have_received(:get).with(
        "https://www.trenord.it/mia/bff/hafas/v2",
        params: hash_including(
          orig: "MILANO CERTOSA",
          dest: "MILANO CADORNA",
          departure_date: "20260826",
          departure_hour: "22:30",
          live_data: "true"
        )
      )
    end

    it "sends the headers Akamai wants to see" do
      client.journeys(origin: "A", destination: "B", departs_at:)

      expect(http).to have_received(:headers).with(
        hash_including("Referer" => "https://www.trenord.it/store/", "X-3N-Language" => "en")
      )
    end

    it "answers failure for an error status" do
      allow(http).to receive(:get).and_return respond("", status: 503)

      expect(client.journeys(origin: "A", destination: "B", departs_at:)).to be_failure(
        "Trenord answered 503 for https://www.trenord.it/mia/bff/hafas/v2."
      )
    end

    it "answers failure when the connection fails" do
      allow(http).to receive(:get).and_raise HTTP::ConnectionError

      expect(client.journeys(origin: "A", destination: "B", departs_at:)).to be_failure(
        "Unable to connect to https://www.trenord.it/mia/bff/hafas/v2."
      )
    end
  end

  describe "#stations" do
    let(:body) { %([{"NomeGeoStazioni":"MILANO CERTOSA"}]) }

    before { allow(http).to receive(:get).and_return respond(body) }

    it "answers parsed records" do
      expect(client.stations).to be_success([{"NomeGeoStazioni" => "MILANO CERTOSA"}])
    end

    it "asks for the whole registry without a query" do
      client.stations

      expect(http).to have_received(:get).with(
        "https://www.trenord.it/mia/v2/stazioni_v2/",
        params: hash_not_including(:_q)
      )
    end

    it "asks for a case insensitive name match with a query" do
      client.stations query: "milano"

      expect(http).to have_received(:get).with(
        anything,
        params: hash_including(_q: %({"NomeGeoStazioni": {"$regex": "milano", "$options": "i"}}))
      )
    end

    it "strips characters that could break out of the query" do
      client.stations query: %(mil"ano{$ne:1})

      expect(http).to have_received(:get).with(
        anything,
        params: hash_including(
          _q: %({"NomeGeoStazioni": {"$regex": "mil ano  ne 1", "$options": "i"}})
        )
      )
    end

    it "answers failure for malformed JSON" do
      allow(http).to receive(:get).and_return respond("<html>")

      expect(client.stations).to be_failure("Trenord station registry answered malformed JSON.")
    end
  end
end
