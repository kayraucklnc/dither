# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Actions::Designs::Edit, :db do
  subject(:action) { described_class.new }

  describe "#call" do
    it "answers errors with invalid parameters" do
      response = action.call Hash.new
      expect(response.status).to eq(422)
    end
  end
end
