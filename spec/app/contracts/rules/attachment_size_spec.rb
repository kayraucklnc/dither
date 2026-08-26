# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Contracts::Rules::AttachmentSize do
  subject(:contract) { simulation.new }

  let :simulation do
    implementation = described_class

    Class.new Dry::Validation::Contract do
      params { required(:test).hash { optional(:attachment).filled Terminus::Schemas::Attachment } }
      rule(test: :attachment, &implementation)
    end
  end

  describe "#call" do
    let :attributes do
      {
        test: {
          attachment: {
            name: "test",
            type: "text/plain",
            head: "test",
            filename: "test.txt",
            tempfile:
          }
        }
      }
    end

    let(:tempfile) { StringIO.new "x" * 500 }

    it "answers success when valid" do
      result = contract.call attributes
      expect(result.success?).to be(true)
    end

    it "answers success when attachment is missing" do
      attributes[:test].delete :attachment
      result = contract.call attributes

      expect(result.success?).to be(true)
    end

    context "when size is too large" do
      let(:tempfile) { StringIO.new "x" * 600_000 }
      let(:result) { contract.call attributes }

      it "answers failure" do
        expect(result.failure?).to be(true)
      end

      it "answers failure message" do
        expect(result.errors.to_h).to eq(test: {attachment: ["must be less than 500.0 KB"]})
      end
    end
  end
end
