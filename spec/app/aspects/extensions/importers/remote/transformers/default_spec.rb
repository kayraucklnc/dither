# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Importers::Remote::Transformers::Default do
  subject(:transformer) { described_class.new }

  describe "#call" do
    let :attributes do
      {
        label: "Test",
        interval: 120
      }
    end

    it "answers default values" do
      expect(transformer.call(attributes)).to be_success(
        label: "Test",
        name: "test",
        description: "Imported from TRMNL.",
        interval: 1,
        unit: "none"
      )
    end

    it "answers name with forward slashes converted to underscores" do
      attributes[:label] = "Test - A - B - C"

      expect(transformer.call(attributes)).to be_success(
        label: "Test - A - B - C",
        name: "test_a_b_c",
        description: "Imported from TRMNL.",
        interval: 1,
        unit: "none"
      )
    end
  end
end
