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
