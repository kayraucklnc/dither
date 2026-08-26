# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Transit::Finder do
  subject(:finder) { described_class.new trenord: }

  include Dry::Monads[:result]

  let(:trenord) { instance_double Dither::Aspects::Transit::Providers::Trenord::Provider }
  let(:values) { {"origin" => "MILANO CERTOSA", "destination" => "MILANO CADORNA"} }

  describe "#call" do
    it "asks Trenord for a board" do
      allow(trenord).to receive(:board).and_return Success("board")
      finder.call values

      expect(trenord).to have_received(:board).with(
        an_object_having_attributes(origin: "MILANO CERTOSA", timezone: "Europe/Rome")
      )
    end

    it "answers failure for invalid settings" do
      expect(finder.call({})).to be_failure("Transit origin is missing.")
    end

    it "answers failure for an unknown provider" do
      expect(finder.call(values.merge("provider" => "atm"))).to be_failure(
        "Unsupported transit provider: it/milan/atm."
      )
    end
  end

  describe "#stations" do
    it "asks Trenord for stations" do
      allow(trenord).to receive(:stations).and_return Success([])
      finder.stations provider: "trenord", query: "milano"

      expect(trenord).to have_received(:stations).with(query: "milano", limit: 25)
    end

    it "answers failure for an unknown provider" do
      expect(finder.stations(provider: "atm")).to be_failure("Unknown transit provider: atm.")
    end
  end
end
