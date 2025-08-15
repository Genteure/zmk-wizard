import { createElementSize } from '@solid-primitives/resize-observer';
import { createEffect, createMemo, createSignal, For, mergeProps, type Accessor, type Component, type JSX } from 'solid-js';
import { getKeysBoundingBox, getKeyStyles } from '~/lib/geometry';
import { type Key } from "~/lib/types";

export const KeyboardLayoutPreview: Component<{
  keys: Accessor<Key[]>,
  children: (styles: Accessor<JSX.CSSProperties>, key: Key, index: Accessor<number>) => JSX.Element,
  heightClass?: string
}> = function (props) {
  props = mergeProps({
    heightClass: 'max-h-96',
  }, props)

  const [scale, setScale] = createSignal(1);
  const [resizeContainerRef, setResizeContainerRef] = createSignal<HTMLDivElement>();
  const containerSize = createElementSize(resizeContainerRef);
  createEffect(() => {
    updateScale();
  })

  const boundingBoxForKeys = createMemo(() => {
    const bbox = getKeysBoundingBox(props.keys());
    return {
      keyCount: props.keys().length,
      width: bbox.max.x - bbox.min.x,
      height: bbox.max.y - bbox.min.y,
      ...bbox
    };
  });

  const updateScale = () => {
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    if (containerWidth === null || containerHeight === null) return;

    if (boundingBoxForKeys().keyCount === 0) {
      setScale(1);
      return;
    }

    const scaleX = (containerWidth - 20) / boundingBoxForKeys().width;
    const scaleY = (containerHeight - 20) / boundingBoxForKeys().height;
    let newScale = Math.min(scaleX, scaleY, 1.75);

    setScale(newScale);
  };

  return (
    <div ref={setResizeContainerRef} class={"aspect-[2/1] w-full relative " + props.heightClass}>
      <div style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: `translate(-50%, -50%) scale(${scale()})`,
        'transform-origin': 'center center'
      }}>
        <div style={{
          position: 'relative',
          top: `${-boundingBoxForKeys().min.y}px`,
          left: `${-boundingBoxForKeys().min.x}px`,
          width: `${boundingBoxForKeys().width}px`,
          height: `${boundingBoxForKeys().height}px`,
        }}>
          <For
            each={props.keys()}
            fallback={<div class="text-base-content/65">No keys to see here</div>}
          >
            {(item, index) => props.children(() => getKeyStyles(item), item, index)}
          </For>
        </div>
      </div>
    </div>
  );
}
