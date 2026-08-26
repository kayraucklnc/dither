# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Transit::Catalog do
  subject(:catalog) { described_class }

  describe ".countries" do
    it "answers Italy" do
      expect(catalog.countries.map { it["code"] }).to contain_exactly("it")
    end
  end

  describe ".cities" do
    it "answers Milan for Italy" do
      expect(catalog.cities("it").map { it["code"] }).to contain_exactly("milan")
    end

    it "answers empty array for unknown country" do
      expect(catalog.cities("xx")).to eq([])
    end
  end

  describe ".city" do
    it "answers time zone" do
      expect(catalog.city("it", "milan")["timezone"]).to eq("Europe/Rome")
    end
  end

  describe ".providers" do
    it "answers Trenord for Milan" do
      expect(catalog.providers("it", "milan").map { it["code"] }).to contain_exactly("trenord")
    end

    it "answers empty array for unknown city" do
      expect(catalog.providers("it", "rome")).to eq([])
    end
  end

  describe ".provider" do
    it "answers journey shape" do
      expect(catalog.provider("it", "milan", "trenord")["shape"]).to eq("journey")
    end
  end

  describe ".supports?" do
    it "answers true for Milan and Trenord" do
      expect(catalog.supports?("it", "milan", "trenord")).to be(true)
    end

    it "answers false for unknown provider" do
      expect(catalog.supports?("it", "milan", "atm")).to be(false)
    end
  end
end
