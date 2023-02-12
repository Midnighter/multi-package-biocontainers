importScripts("https://cdn.jsdelivr.net/pyodide/v0.22.1/full/pyodide.js");

function sendPatch(patch, buffers, msg_id) {
  self.postMessage({
    type: 'patch',
    patch: patch,
    buffers: buffers
  })
}

async function startApplication() {
  console.log("Loading pyodide!");
  self.postMessage({type: 'status', msg: 'Loading pyodide'})
  self.pyodide = await loadPyodide();
  self.pyodide.globals.set("sendPatch", sendPatch);
  console.log("Loaded!");
  await self.pyodide.loadPackage("micropip");
  const env_spec = ['https://cdn.holoviz.org/panel/0.14.3/dist/wheels/bokeh-2.4.3-py3-none-any.whl', 'https://cdn.holoviz.org/panel/0.14.3/dist/wheels/panel-0.14.3-py3-none-any.whl', 'pyodide-http==0.1.0', 'bleach==6.0.0', 'boltons==21.0.0', 'certifi==2022.12.7', 'charset-normalizer==3.0.1', 'docutils==0.19', 'galaxy-containers==22.1.1', 'galaxy-tool-util==22.1.5', 'galaxy-util==22.1.2', 'idna==3.4', 'importlib-resources==5.10.2', 'lxml==4.9.2', 'markupsafe==2.1.2', 'packaging==21.3', 'pycryptodome==3.17', 'pydantic==1.10.4', 'pyparsing==3.0.9', 'pyyaml==6.0', 'repoze-lru==0.7', 'requests==2.28.2', 'routes==2.5.1', 'six==1.16.0', 'sortedcontainers==2.4.0', 'typing-extensions==4.4.0', 'urllib3==1.26.14', 'webencodings==0.5.1', 'zipstream-new==1.1.8']
  for (const pkg of env_spec) {
    let pkg_name;
    if (pkg.endsWith('.whl')) {
      pkg_name = pkg.split('/').slice(-1)[0].split('-')[0]
    } else {
      pkg_name = pkg
    }
    self.postMessage({type: 'status', msg: `Installing ${pkg_name}`})
    try {
      await self.pyodide.runPythonAsync(`
        import micropip
        await micropip.install('${pkg}');
      `);
    } catch(e) {
      console.log(e)
      self.postMessage({
	type: 'status',
	msg: `Error while installing ${pkg_name}`
      });
    }
  }
  console.log("Packages loaded!");
  self.postMessage({type: 'status', msg: 'Executing code'})
  const code = `
  
import asyncio

from panel.io.pyodide import init_doc, write_doc

init_doc()

# MIT License
#
# Copyright (c) 2023 Moritz E. Beber
# Copyright (c) 2018 nf-core
#
# Permission is hereby granted, free of charge, to any person obtaining a copy
# of this software and associated documentation files (the "Software"), to deal
# in the Software without restriction, including without limitation the rights
# to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
# copies of the Software, and to permit persons to whom the Software is
# furnished to do so, subject to the following conditions:
#
# The above copyright notice and this permission notice shall be included in all
# copies or substantial portions of the Software.
#
# THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
# IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
# FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
# AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
# LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
# OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
# SOFTWARE.


""""""


import logging
import re
from typing import Iterable, List, Optional, Tuple

import panel as pn
import param
import requests
from galaxy.tool_util.deps.mulled.util import build_target, v2_image_name
from packaging.version import InvalidVersion, Version


log = logging.getLogger(__name__)
pn.extension(sizing_mode="stretch_width")


class MulledImageNameGenerator:
    """
    Define a service class for generating BioContainers version 2 mulled image names.

    Adapted from https://gist.github.com/natefoo/19cefeedd1942c30f9d88027a61b3f83.
    """

    _split_pattern = re.compile(r"==?")

    @classmethod
    def parse_targets(cls, specifications: Iterable[str]) -> List[Tuple[str, str]]:
        """
        Parse tool, version pairs from specification strings.

        Args:
            specifications: An iterable of strings that contain tools and their
                versions.

        Returns:
            A list of tool, version pairs.

        """
        result = []
        for spec in specifications:
            try:
                tool, version = cls._split_pattern.split(spec, maxsplit=1)
            except ValueError:
                raise ValueError(
                    f"The specification '{spec}' does not have the expected format "
                    f"<tool==version> or <tool=version>."
                ) from None
            try:
                Version(version)
            except InvalidVersion:
                raise ValueError(
                    f"Not a PEP440 version spec: '{version}' in '{spec}'"
                ) from None
            result.append((tool.strip(), version.strip()))
        return result

    @classmethod
    def generate_image_name(
        cls,
        targets: Iterable[Tuple[str, str]],
        base_image: Optional[str] = None,
        build_number: int = 0,
    ) -> str:
        """
        Generate the name of a BioContainers mulled image version 2.

        Args:
            targets: One or more tool, version pairs of the multi-tool container image.
            base_image: The chosen base image (if non-default).
            build_number: The build number for this image. This is an incremental value
                that starts at zero.

        Returns:
            The generated image name:tag.

        """
        return v2_image_name(
            [build_target(name, version) for name, version in targets],
            name_override=base_image,
            image_build=str(build_number),
        )

    @classmethod
    def image_exists(cls, image_name: str) -> bool:
        """
        Check whether the given BioContainers image already exists.

        Make a call to the quay.io API in order to confirm the existence of the image.

        Args:
            image_name: The container image name:tag to check.

        Returns:
            Whether the image exists at quay.io.

        """
        quay_url = f"https://quay.io/biocontainers/{image_name}/"
        response = requests.get(quay_url, allow_redirects=True)
        log.debug(f"Got response code '{response.status_code}' for URL {quay_url}.")
        if response.status_code == 200:
            log.info(
                f"Found [link={quay_url}]docker image[/link] on quay.io! :sparkles:"
            )
            return True
        else:
            log.error(
                f"Unable to find [link={quay_url}]docker image[/link] on quay.io."
            )
            return False


class PanelApp(param.Parameterized):
    """"""

    def __init__(self, **params) -> None:
        super().__init__(**params)
        self._tools_column = pn.Column()

    def layout_tool_input(self) -> pn.Row:
        return pn.Row(
            pn.widgets.TextInput(
                name="Tool", value="", placeholder="For example, numpy"
            ),
            pn.widgets.TextInput(
                name="Version", value="", placeholder="For example, 1.21.0"
            ),
        )

    def layout_add_button(self) -> pn.widgets.Button:
        return pn.widgets.Button(name="Add Tool", button_type="primary")

    def on_add(self, event: param.parameterized.Event) -> None:
        self._tools_column.append(self.layout_tool_input())

    def layout_remove_button(self) -> pn.widgets.Button:
        return pn.widgets.Button(name="Remove Tool", button_type="default")

    def on_remove(self, event: param.parameterized.Event) -> None:
        self._tools_column[:] = self._tools_column[:-1]

    def layout_submit_button(self) -> pn.widgets.Button:
        return pn.widgets.Button(name="Generate Image Name", button_type="primary")

    def layout_reset_button(self) -> pn.widgets.Button:
        return pn.widgets.Button(name="Reset", button_type="default")

    def on_reset(self, event: param.parameterized.Event) -> None:
        self._tools_column.clear()
        self._tools_column.append(self.layout_tool_input())

    def on_submit(self, event: param.parameterized.Event) -> None:
        tools = []
        for row in self._tools_column:
            tool, version = row[:]
            tools.append((tool.value.strip(), version.value.strip()))
        image = MulledImageNameGenerator.generate_image_name(targets=tools)
        self._tools_column.clear()
        text = pn.pane.HTML(
            f"""
            <code>
            {image}
            </code>
            <button onclick="navigator.clipboard.writeText('{image}')">
            📋
            </button>
            """
        )
        self._tools_column.append(pn.Row(text))
        self._tools_column.append(
            pn.pane.Markdown(
                f"[https://quay.io/biocontainers/{image}]("
                f"https://quay.io/biocontainers/{image}) "
                f"{'✓' if MulledImageNameGenerator.image_exists(image) else '❌'}"
            )
        )

    def view(self) -> Tuple[pn.Row, pn.Column]:
        add = self.layout_add_button()
        add.on_click(self.on_add)
        remove = self.layout_remove_button()
        remove.on_click(self.on_remove)
        submit = self.layout_submit_button()
        submit.on_click(self.on_submit)
        reset = self.layout_reset_button()
        reset.on_click(self.on_reset)
        self._tools_column.append(self.layout_tool_input())
        return pn.Row(submit, reset, add, remove), self._tools_column


app = PanelApp()
template = pn.template.FastListTemplate(
    site="Multi-Package BioContainers",
    title="Generate Name",
    main=[*app.view()],
)
template.servable()


await write_doc()
  `

  try {
    const [docs_json, render_items, root_ids] = await self.pyodide.runPythonAsync(code)
    self.postMessage({
      type: 'render',
      docs_json: docs_json,
      render_items: render_items,
      root_ids: root_ids
    })
  } catch(e) {
    const traceback = `${e}`
    const tblines = traceback.split('\n')
    self.postMessage({
      type: 'status',
      msg: tblines[tblines.length-2]
    });
    throw e
  }
}

self.onmessage = async (event) => {
  const msg = event.data
  if (msg.type === 'rendered') {
    self.pyodide.runPythonAsync(`
    from panel.io.state import state
    from panel.io.pyodide import _link_docs_worker

    _link_docs_worker(state.curdoc, sendPatch, setter='js')
    `)
  } else if (msg.type === 'patch') {
    self.pyodide.runPythonAsync(`
    import json

    state.curdoc.apply_json_patch(json.loads('${msg.patch}'), setter='js')
    `)
    self.postMessage({type: 'idle'})
  } else if (msg.type === 'location') {
    self.pyodide.runPythonAsync(`
    import json
    from panel.io.state import state
    from panel.util import edit_readonly
    if state.location:
        loc_data = json.loads("""${msg.location}""")
        with edit_readonly(state.location):
            state.location.param.update({
                k: v for k, v in loc_data.items() if k in state.location.param
            })
    `)
  }
}

startApplication()