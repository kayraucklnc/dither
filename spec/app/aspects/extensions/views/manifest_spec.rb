# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Aspects::Extensions::Views::Manifest do
  subject(:manifest) { described_class.new views: }

  let :views do
    [
      {"name" => "full", "label" => "Full screen", "shape" => "full", "align" => %w[fill]},
      {
        "name" => "vertical",
        "shape" => "vertical",
        "width" => {"min" => 180, "max" => 360},
        "align" => %w[left middle right]
      }
    ]
  end

  describe ".for" do
    it "reads views declared on the extension" do
      extension = Factory.structs[:extension, data: {"views" => views}]

      expect(described_class.for(extension).names).to eq(%w[full vertical])
    end

    it "answers a full screen view when nothing is declared" do
      expect(described_class.for(Factory.structs[:extension, data: {}]).names).to eq(%w[full])
    end
  end

  describe "#supports?" do
    it "answers true for a declared view" do
      expect(manifest.supports?("vertical")).to be(true)
    end

    it "answers false for anything else" do
      expect(manifest.supports?("carousel")).to be(false)
    end
  end

  describe "#resolve" do
    it "answers the requested view" do
      expect(manifest.resolve("vertical").label).to eq("Vertical")
    end

    # A layout page may know about views this extension has never heard of.
    it "answers the first view when the request is unknown" do
      expect(manifest.resolve("carousel").name).to eq("full")
    end

    it "answers the first view without a request" do
      expect(manifest.resolve.name).to eq("full")
    end
  end

  describe "#liquid_attributes" do
    it "answers every declared view" do
      expect(manifest.liquid_attributes.map { it["name"] }).to eq(%w[full vertical])
    end
  end
end
