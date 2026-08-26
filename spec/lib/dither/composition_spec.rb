# frozen_string_literal: true

require "hanami_helper"

RSpec.describe Dither::Composition do
  describe "layouts" do
    it "tiles the grid exactly, with no gaps or overlaps", :aggregate_failures do
      described_class::LAYOUTS.each do |layout|
        cells = layout.slots.flat_map do |slot|
          shape = slot.shape

          (slot.row...(slot.row + shape.rows)).to_a.product(
            (slot.column...(slot.column + shape.columns)).to_a
          )
        end

        expect(cells.uniq.size).to eq(cells.size), "#{layout.id} overlaps"
        expect(cells.size).to eq(described_class::COLUMNS * described_class::ROWS),
                              "#{layout.id} does not cover the panel"
      end
    end

    it "references only known shapes" do
      ids = described_class::LAYOUTS.flat_map(&:shape_ids).uniq

      expect(ids - described_class.shape_ids).to be_empty
    end
  end

  describe ".layouts_satisfiable_by" do
    it "answers only the full page layout for a full page only extension" do
      expect(described_class.layouts_satisfiable_by(%w[full]).map(&:id)).to eq %w[full]
    end

    it "answers layouts whose every slot is covered" do
      ids = described_class.layouts_satisfiable_by(%w[full half_width]).map(&:id)

      expect(ids).to contain_exactly "full", "split_vertical"
    end
  end

  describe "shapes" do
    it "answers pixel size for a panel" do
      expect(described_class.shape("quarter").pixels_for(800, 480)).to eq [400, 240]
    end

    it "answers a slot rect for a panel" do
      slot = described_class.layout("sidebar_left").slot("main")

      expect(slot.rect_for(800, 480)).to eq [267, 0, 533, 480]
    end
  end
end
