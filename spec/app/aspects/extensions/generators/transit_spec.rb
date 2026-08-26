# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Generators::Transit do
  subject(:generator) { described_class.new finder: }

  include Dry::Monads[:result]

  let(:finder) { instance_double Terminus::Aspects::Transit::Finder }

  let :board do
    Terminus::Aspects::Transit::Board[
      origin: "MILANO CERTOSA",
      destination: "MILANO CADORNA",
      provider: "trenord",
      city: "milan",
      country: "it",
      queried_at: "22:30",
      departures: [
        Terminus::Aspects::Transit::Departure[
          line: "S5",
          number: "11881",
          direction: "PIOLTELLO LIMITO",
          scheduled: "22:43",
          expected: "22:48",
          delay: 5,
          platform: "2"
        ]
      ]
    ]
  end

  let :extension do
    Factory.structs[
      :extension,
      kind: "transit",
      fields: [{"keyname" => "origin", "default" => "MILANO CERTOSA"}],
      data: {"values" => {"destination" => "MILANO CADORNA", "limit" => 3}},
      template: <<~BODY
        <p>{{transit.origin}} to {{transit.destination}}</p>
        {% for departure in transit.departures %}
          <p>{{departure.line}} {{departure.expected}} +{{departure.delay}}</p>
        {% endfor %}
      BODY
    ]
  end

  describe "#call" do
    it "renders the board" do
      allow(finder).to receive(:call).and_return Success(board)

      expect(generator.call(extension)).to be_success(<<~CONTENT.strip)
        <html><head></head><body><p>MILANO CERTOSA to MILANO CADORNA</p>

          <p>S5 22:48 +5</p>

        </body></html>
      CONTENT
    end

    it "merges field defaults with data values" do
      allow(finder).to receive(:call).and_return Success(board)
      generator.call extension

      expect(finder).to have_received(:call).with(
        "origin" => "MILANO CERTOSA", "destination" => "MILANO CADORNA", "limit" => 3
      )
    end

    it "answers failure when the provider fails" do
      allow(finder).to receive(:call).and_return Failure("Trenord answered 503.")

      expect(generator.call(extension)).to be_failure("Trenord answered 503.")
    end
  end
end
