# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Actions::Playlists::Screens::Index, :db do
  subject(:action) { described_class.new }

  it "answers unprocessable entity with invalid parameters" do
    response = action.call Hash.new
    expect(response.status).to eq(422)
  end
end
