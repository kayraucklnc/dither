# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Views::Parts::Model, :db do
  subject(:part) { described_class.new value: model, rendering: Terminus::View.new.rendering }

  let(:model) { Factory.structs[:model] }

  describe "#allowd_palettes", :db do
    let(:model) { Factory[:model] }
    let(:palette) { Factory[:palette, label: "Test"] }
    let(:association) { Factory[:model_palette, model_id: model.id, palette_id: palette.id] }

    it "answers names when associations exist" do
      association
      expect(part.allowed_palettes).to eq("Test")
    end

    it "answers all with no associations" do
      expect(part.allowed_palettes).to eq("All")
    end
  end

  describe "#default_palette_label", :db do
    context "when default exists" do
      let :model do
        palette = Factory[:palette, label: "Test"]
        model = Factory[:model, default_palette_id: palette.id]
        Terminus::Repositories::Model.new.find model.id
      end

      it "answers label" do
        expect(part.default_palette_label).to eq("Test")
      end
    end

    it "answers none when default is missing" do
      expect(part.default_palette_label).to eq("None")
    end
  end

  describe "#formatted_css" do
    it "answers empty string when attributes are empty" do
      expect(part.formatted_css).to eq("")
    end

    it "answers formatted code when attributes exist" do
      allow(model).to receive(:css).and_return(
        {
          classes: {
            size: "screen--lg",
            device: "screen--v2"
          }
        }
      )

      expect(part.formatted_css).to eq(<<~JSON.strip)
        {
          "classes": {
            "size": "screen--lg",
            "device": "screen--v2"
          }
        }
      JSON
    end
  end

  describe "#dimensions" do
    it "answers default dimensions" do
      expect(part.dimensions).to eq("800x480")
    end

    context "with custom dimensions" do
      let(:model) { Factory.structs[:model, width: 400, height: 240] }

      it "answers custom width and height" do
        expect(part.dimensions).to eq("400x240")
      end
    end
  end

  describe "#kind_label" do
    it "answers capitalized label" do
      expect(part.kind_label).to eq("Terminus")
    end

    context "with byod" do
      let(:model) { Factory.structs[:model, kind: "byod"] }

      it "answers upcase" do
        expect(part.kind_label).to eq("BYOD")
      end
    end

    context "with trmnl" do
      let(:model) { Factory.structs[:model, kind: "trmnl"] }

      it "answers upcase" do
        expect(part.kind_label).to eq("TRMNL")
      end
    end
  end
end
