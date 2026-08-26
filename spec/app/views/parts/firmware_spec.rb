# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Views::Parts::Firmware do
  subject(:part) { described_class.new value: firmware, rendering: Dither::View.new.rendering }

  let(:firmware) { Factory.structs[:firmware] }

  describe "#kind_label" do
    it "answers capitalized label" do
      expect(part.kind_label).to eq("Dither")
    end

    context "with trmnl" do
      let(:firmware) { Factory.structs[:firmware, kind: "trmnl"] }

      it "answers upcase" do
        expect(part.kind_label).to eq("TRMNL")
      end
    end
  end
end
