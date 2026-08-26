# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Extensions::Importers::Remote::Transformers::Data do
  subject(:transformer) { described_class.new }

  describe "#call" do
    let :attributes do
      {
        fields: [
          {"keyname" => "one", "default" => 1},
          {"keyname" => "two", "default" => 2}
        ]
      }
    end

    it "answers data defaults" do
      expect(transformer.call(attributes)).to be_success(
        fields: [
          {"keyname" => "one", "default" => 1},
          {"keyname" => "two", "default" => 2}
        ],
        data: {"values" => {"one" => 1, "two" => 2}}
      )
    end

    it "answers empty data hash when defaults are missing" do
      attributes = {fields: [{"keyname" => "one"}]}
      expect(transformer.call(attributes)).to be_success(fields: [{"keyname" => "one"}], data: {})
    end

    it "answers empty data hash when fields are missing" do
      expect(transformer.call({})).to be_success(data: {})
    end
  end
end
