import type { VoidComponent } from "solid-js";

export const ConfigKeyboard: VoidComponent = () => {

  return (
    <>
      {/* Module card */}
      <div
        class="p-2 border border-base-300 rounded-lg bg-base-200"
      >
        <div class="text-lg font-semibold mb-2">
          External Modules
        </div>
        {/* yaml looking module list */}
        <div class="code-area yamlhl grid grid-cols-2">
          <pre><code>
            <span class="line"><span class="hl-k">manifest</span><span class="hl-t">:</span></span>
            <span class="line">  <span class="hl-k">projects</span><span class="hl-t">:</span></span>
            <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">core_module</span> <span class="hl-c"># Example module</span></span>
            <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <div>
            {/* nothing */}
          </div>
          <pre><code>
            <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_1</span> <span class="hl-c"># Provides feature 1</span></span>
            <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <button class="btn btn-sm btn-ghost text-red-500">
            Remove
          </button>
          <pre><code>
            <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_module_2</span> <span class="hl-c"># Feature 2</span></span>
            <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <button class="btn btn-sm btn-ghost text-red-500">
            Remove
          </button>
          <pre><code>
            ...
          </code></pre>
        </div>

      </div>

      <div>
        <div class="code-area yamlhl border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-900 overflow-hidden">
          {/* Header with add buttons (out of scope) */}
          <div class="px-4 py-2 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            {/* Add section buttons would go here */}
          </div>

          <div class="grid grid-cols-[1fr_auto] divide-x divide-gray-200 dark:divide-gray-700">
            {/* Code section - spans full width initially */}
            <div class="col-span-2 p-4">
              <pre><code>
                <span class="line"><span class="hl-k">manifest</span><span class="hl-t">:</span></span>
                <span class="line">  <span class="hl-k">projects</span><span class="hl-t">:</span></span>
                <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">core_module</span> <span class="hl-c"># Example module</span></span>
                <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
                <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
              </code></pre>
            </div>

            {/* Removable section 1 */}
            <div class="col-span-2 grid grid-cols-[1fr_auto] divide-x divide-gray-200 dark:divide-gray-700">
              <div class="p-4">
                <pre><code>
                  <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_1</span> <span class="hl-c"># Provides feature 1</span></span>
                  <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
                  <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
                </code></pre>
              </div>
              <div class="p-4 flex items-start justify-center bg-white dark:bg-gray-800">
                <button class="btn btn-sm btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  Remove
                </button>
              </div>
            </div>

            {/* Removable section 2 */}
            <div class="col-span-2 grid grid-cols-[1fr_auto] divide-x divide-gray-200 dark:divide-gray-700">
              <div class="p-4">
                <pre><code>
                  <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_module_2</span> <span class="hl-c"># Feature 2</span></span>
                  <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
                  <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
                </code></pre>
              </div>
              <div class="p-4 flex items-start justify-center bg-white dark:bg-gray-800">
                <button class="btn btn-sm btn-ghost text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20">
                  Remove
                </button>
              </div>
            </div>

            {/* Continue section */}
            <div class="col-span-2 p-4">
              <pre><code>
                <span class="line">    <span class="hl-c"># ... more content</span></span>
              </code></pre>
            </div>
          </div>
        </div>
      </div>


      AAAAA
      <div>
        <div class="code-area yamlhl grid grid-cols-[1fr_auto] text-sm/tight">
          {/* Static header section */}
          <pre><code>
            <span class="line"><span class="hl-k">manifest</span><span class="hl-t">:</span></span>
            <span class="line"><span class="hl-k">&nbsp;&nbsp;projects</span><span class="hl-t">:</span></span>
            <span class="line">&nbsp;&nbsp;&nbsp;&nbsp;<span class="hl-t">- </span><span class="hl-k">name</span><span class="hl-t">:</span> <span class="hl-s">core_module</span> <span class="hl-c"># Example module</span></span>
            <span class="line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <div />

          {/* Removable section 1 */}
          <pre><code>
            <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_1</span> <span class="hl-c"># Provides feature 1</span></span>
            <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <button class="btn btn-sm btn-ghost text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            Remove
          </button>

          {/* Removable section 2 */}
          <pre><code>
            <span class="line">    <span class="hl-k">- name</span><span class="hl-t">:</span> <span class="hl-s">optional_module_2</span> <span class="hl-c"># Feature 2</span></span>
            <span class="line">      <span class="hl-k">remote</span><span class="hl-t">:</span> <span class="hl-s">modules/my_module</span></span>
            <span class="line">      <span class="hl-k">revision</span><span class="hl-t">:</span> <span class="hl-s">main</span></span>
          </code></pre>
          <button class="btn btn-sm btn-ghost text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950">
            Remove
          </button>

          {/* Additional sections... */}
          <pre><code>
            <span class="line">    <span class="hl-t">...</span></span>
          </code></pre>
          <div />
        </div>

      </div>
    </>);
};
