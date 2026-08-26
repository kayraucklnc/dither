# frozen_string_literal: true

module Dither
  # The composition vocabulary: the closed set of shapes an extension may
  # occupy, and the layouts a scene may be built from.
  #
  # This exists so that "what shapes are there" has exactly one answer, shared
  # by the extension loader, the composer UI, the renderer, and the docs. An
  # extension declares which shapes it can fill; the composer will not let it be
  # dropped anywhere else. Nothing scales a full-page design down to fit — a
  # design that was not authored for a shape simply is not offered for it.
  #
  # Everything is expressed against a 6x6 grid, which is the smallest grid where
  # both halves (3) and thirds (2) divide evenly.
  module Composition
    COLUMNS = 6
    ROWS = 6

    # One footprint an extension can be authored for. Columns and rows are grid
    # units; width and height are the fraction of the panel they cover.
    Shape = Data.define :id, :label, :columns, :rows, :hint do
      def width = Rational(columns, COLUMNS)

      def height = Rational(rows, ROWS)

      def full? = columns == COLUMNS && rows == ROWS

      # Pixel size of this shape on a given panel, which is what the renderer
      # screenshots at and what the template receives as {{ slot.width }}.
      def pixels_for panel_width, panel_height
        [(panel_width * width).round, (panel_height * height).round]
      end

      def aspect_ratio = "#{(width * 12).to_i} / #{(height * 12).to_i}"
    end

    # One position within a layout. Column and row are 1-indexed grid origins,
    # so a slot maps straight onto CSS grid placement.
    Slot = Data.define :key, :shape_id, :column, :row do
      def shape = Composition.shape shape_id

      def grid_column = "#{column} / span #{shape.columns}"

      def grid_row = "#{row} / span #{shape.rows}"

      # Pixel rect on a given panel: [x, y, width, height].
      def rect_for panel_width, panel_height
        width, height = shape.pixels_for panel_width, panel_height

        [
          (panel_width * Rational(column - 1, COLUMNS)).round,
          (panel_height * Rational(row - 1, ROWS)).round,
          width,
          height
        ]
      end
    end

    # An arrangement of slots covering the whole panel with no gaps or overlaps.
    Layout = Data.define :id, :label, :description, :slots do
      def size = slots.size

      def single? = slots.size == 1

      def shape_ids = slots.map(&:shape_id).uniq

      def slot(key) = slots.find { it.key == key.to_s }
    end

    SHAPES = [
      Shape[
        id: "full",
        label: "Full page",
        columns: 6,
        rows: 6,
        hint: "The whole panel. Every extension should have this one."
      ],
      Shape[
        id: "half_width",
        label: "Half width",
        columns: 3,
        rows: 6,
        hint: "A tall column down one side. Full height, half the width."
      ],
      Shape[
        id: "half_height",
        label: "Half height",
        columns: 6,
        rows: 3,
        hint: "A wide band across the panel. Full width, half the height."
      ],
      Shape[
        id: "quarter",
        label: "Quarter",
        columns: 3,
        rows: 3,
        hint: "One corner. Room for a heading and a couple of lines."
      ],
      Shape[
        id: "third_width",
        label: "Third width",
        columns: 2,
        rows: 6,
        hint: "A narrow full-height column. Good for a list of short rows."
      ],
      Shape[
        id: "two_thirds_width",
        label: "Two thirds width",
        columns: 4,
        rows: 6,
        hint: "The wide side of a sidebar split."
      ],
      Shape[
        id: "third_height",
        label: "Third height",
        columns: 6,
        rows: 2,
        hint: "A full-width strip. Good for a banner or a status line."
      ],
      Shape[
        id: "two_thirds_height",
        label: "Two thirds height",
        columns: 6,
        rows: 4,
        hint: "The tall side of a banner split."
      ]
    ].freeze

    SHAPES_BY_ID = SHAPES.to_h { [it.id, it] }.freeze

    LAYOUTS = [
      Layout[
        id: "full",
        label: "Full page",
        description: "One extension, whole panel.",
        slots: [Slot["main", "full", 1, 1]]
      ],
      Layout[
        id: "split_vertical",
        label: "Side by side",
        description: "Two tall columns.",
        slots: [Slot["left", "half_width", 1, 1], Slot["right", "half_width", 4, 1]]
      ],
      Layout[
        id: "split_horizontal",
        label: "Stacked",
        description: "Two wide bands.",
        slots: [Slot["top", "half_height", 1, 1], Slot["bottom", "half_height", 1, 4]]
      ],
      Layout[
        id: "quadrants",
        label: "Quadrants",
        description: "Four corners.",
        slots: [
          Slot["top_left", "quarter", 1, 1],
          Slot["top_right", "quarter", 4, 1],
          Slot["bottom_left", "quarter", 1, 4],
          Slot["bottom_right", "quarter", 4, 4]
        ]
      ],
      Layout[
        id: "columns",
        label: "Three columns",
        description: "Three narrow full-height columns.",
        slots: [
          Slot["first", "third_width", 1, 1],
          Slot["second", "third_width", 3, 1],
          Slot["third", "third_width", 5, 1]
        ]
      ],
      Layout[
        id: "rows",
        label: "Three rows",
        description: "Three full-width strips.",
        slots: [
          Slot["first", "third_height", 1, 1],
          Slot["second", "third_height", 1, 3],
          Slot["third", "third_height", 1, 5]
        ]
      ],
      Layout[
        id: "sidebar_left",
        label: "Sidebar, left",
        description: "A narrow column beside a wide one.",
        slots: [Slot["side", "third_width", 1, 1], Slot["main", "two_thirds_width", 3, 1]]
      ],
      Layout[
        id: "sidebar_right",
        label: "Sidebar, right",
        description: "A wide column beside a narrow one.",
        slots: [Slot["main", "two_thirds_width", 1, 1], Slot["side", "third_width", 5, 1]]
      ],
      Layout[
        id: "banner",
        label: "Banner and body",
        description: "A strip across the top, the rest below.",
        slots: [Slot["banner", "third_height", 1, 1], Slot["main", "two_thirds_height", 1, 3]]
      ],
      Layout[
        id: "footer",
        label: "Body and strip",
        description: "The main area with a strip along the bottom.",
        slots: [Slot["main", "two_thirds_height", 1, 1], Slot["footer", "third_height", 1, 5]]
      ]
    ].freeze

    LAYOUTS_BY_ID = LAYOUTS.to_h { [it.id, it] }.freeze

    DEFAULT_LAYOUT = "full"
    DEFAULT_SHAPE = "full"

    def self.shape(id) = SHAPES_BY_ID.fetch id.to_s, nil

    def self.shape?(id) = SHAPES_BY_ID.key? id.to_s

    def self.shape_ids = SHAPES.map(&:id)

    def self.layout(id) = LAYOUTS_BY_ID.fetch id.to_s, nil

    def self.layout?(id) = LAYOUTS_BY_ID.key? id.to_s

    # Layouts every one of whose slots can be filled by at least one of the
    # given shapes. Used to hide arrangements nothing on hand can satisfy
    # instead of offering them and failing at drop time.
    def self.layouts_satisfiable_by shape_ids
      wanted = Array(shape_ids).map(&:to_s).to_set
      LAYOUTS.select { |layout| layout.shape_ids.all? { wanted.include? it } }
    end

    # Splits declared shapes into ones we know and ones we do not, so a loader
    # can report the typo rather than silently dropping the variant.
    def self.partition_shapes ids
      Array(ids).map(&:to_s).uniq.partition { shape? it }
    end
  end
end
