# frozen_string_literal: true

# The rule form picks a scene from rendered thumbnails. The radio itself is
# visually hidden so the frame can carry selection, which is the right pattern
# for accessibility but means a test has to reach it through its label.
module ScenePicker
  def pick_scene label
    id = Dither::Repositories::Scene.new.find_by(label:).id

    choose option: id.to_s, allow_label_click: true
  end
end

RSpec.configure { |config| config.include ScenePicker, type: :feature }
