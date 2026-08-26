# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Screens::TempPather, :db do
  using Refinements::Struct

  subject(:pather) { described_class.new }

  include_context "with screen mold"

  describe "#call" do
    let(:model) { Factory[:model] }

    before { mold.with! model_id: model.id }

    it "answers path with specific name and extension (without block)" do
      expect(pather.call(mold).to_s).to include("test.png")
    end

    it "answers pathname (without block)" do
      expect(pather.call(mold)).to match(kind_of(Pathname))
    end

    it "answers path with specific name and extension (with block)" do
      capture = nil
      pather.call(mold) { capture = it.to_s }

      expect(capture).to include("test.png")
    end

    it "answers pathname (with block)" do
      capture = nil
      pather.call(mold) { capture = it }

      expect(capture).to match(kind_of(Pathname))
    end
  end

  describe "#inspect" do
    it "has inspected attributes" do
      expect(pather.inspect).to match_inspection(sanitizer: "Terminus::Aspects::Sanitizer")
    end
  end
end
