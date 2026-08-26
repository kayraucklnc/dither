# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Transit::Providers::Trenord::Registry do
  subject(:registry) { described_class.new client:, clock: -> { now } }

  include Dry::Monads[:result]

  let(:now) { Time.utc 2026, 8, 26, 20, 30, 0 }
  let(:client) { instance_double Dither::Aspects::Transit::Providers::Trenord::Client }

  let :records do
    [
      {
        "NomeGeoStazioni" => "MILANO CERTOSA",
        "CodiceMIR" => "S01640",
        "Comune" => "Milano",
        "Regione" => "Lombardia",
        "country" => "it",
        "platforms" => %w[1 2]
      },
      {"NomeGeoStazioni" => "CERTOSA DI PAVIA", "CodiceMIR" => "S01309", "Comune" => "Certosa"},
      {"NomeGeoStazioni" => "  ", "CodiceMIR" => "S00000"}
    ]
  end

  before { allow(client).to receive(:stations).and_return Success(records) }

  describe "#call" do
    it "answers matching stations, prefixes first" do
      expect(registry.call(query: "certosa").value!.map(&:name)).to eq(
        ["CERTOSA DI PAVIA", "MILANO CERTOSA"]
      )
    end

    it "answers station detail" do
      expect(registry.call(query: "milano certosa").value!.first).to have_attributes(
        code: "S01640",
        name: "MILANO CERTOSA",
        city: "Milano",
        region: "Lombardia",
        country: "it",
        platforms: %w[1 2]
      )
    end

    it "skips nameless records" do
      expect(registry.call.value!.map(&:name)).to eq(["MILANO CERTOSA", "CERTOSA DI PAVIA"])
    end

    it "honors the limit" do
      expect(registry.call(limit: 1).value!.size).to eq(1)
    end

    it "fetches the registry once" do
      registry.call query: "milano"
      registry.call query: "certosa"

      expect(client).to have_received(:stations).once
    end

    it "answers failure when the registry cannot be read" do
      allow(client).to receive(:stations).and_return Failure("Boom.")

      expect(registry.call).to be_failure("Boom.")
    end
  end
end
