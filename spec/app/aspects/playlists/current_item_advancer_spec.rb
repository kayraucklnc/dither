# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Terminus::Aspects::Playlists::CurrentItemAdvancer, :db do
  subject(:advancer) { described_class.new }

  describe "#call" do
    let(:playlist) { Factory[:playlist, mode: "manual"] }
    let(:item) { Factory[:playlist_item, playlist_id: playlist.id] }

    it "advances current item with manual mode" do
      update = advancer.call playlist.id, screen_id: item.screen_id
      expect(update.current_item_id).to eq(item.id)
    end

    context "with automatic mode" do
      let(:playlist) { Factory[:playlist, mode: "automatic"] }

      it "doesn't advance current item" do
        update = advancer.call playlist.id, screen_id: item.screen_id
        expect(update.current_item_id).to be(nil)
      end
    end

    it "answers playlist" do
      expect(advancer.call(playlist.id, screen_id: item.screen_id)).to be_a(
        Terminus::Structs::Playlist
      )
    end
  end
end
