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


"""Test the mulled BioContainers image name generation."""


import pytest

from mulled import MulledImageNameGenerator


@pytest.mark.parametrize(
    "specs, expected",
    [
        (["foo==0.1.2", "bar==1.1"], [("foo", "0.1.2"), ("bar", "1.1")]),
        (["foo=0.1.2", "bar=1.1"], [("foo", "0.1.2"), ("bar", "1.1")]),
    ],
)
def test_target_parsing(specs, expected):
    """Test that valid specifications are correctly parsed into tool, version pairs."""
    assert MulledImageNameGenerator.parse_targets(specs) == expected


@pytest.mark.parametrize(
    "specs",
    [
        ["foo<0.1.2", "bar==1.1"],
        ["foo=0.1.2", "bar>1.1"],
    ],
)
def test_wrong_specification(specs):
    """Test that unexpected version constraints fail."""
    with pytest.raises(ValueError, match="expected format"):
        MulledImageNameGenerator.parse_targets(specs)


@pytest.mark.parametrize(
    "specs",
    [
        ["foo==0a.1.2", "bar==1.1"],
        ["foo==0.1.2", "bar==1.b1b"],
    ],
)
def test_noncompliant_version(specs):
    """Test that version string that do not comply with PEP440 fail."""
    with pytest.raises(ValueError, match="PEP440"):
        MulledImageNameGenerator.parse_targets(specs)


@pytest.mark.parametrize(
    "specs, expected",
    [
        (
            [("chromap", "0.2.1"), ("samtools", "1.15")],
            "mulled-v2-1f09f39f20b1c4ee36581dc81cc323c70e661633:bd74d08a359024829a7aec1638a28607bbcd8a58-0",
        ),
        (
            [("pysam", "0.16.0.1"), ("biopython", "1.78")],
            "mulled-v2-3a59640f3fe1ed11819984087d31d68600200c3f:185a25ca79923df85b58f42deb48f5ac4481e91f-0",
        ),
        (
            [("samclip", "0.4.0"), ("samtools", "1.15")],
            "mulled-v2-d057255d4027721f3ab57f6a599a2ae81cb3cbe3:13051b049b6ae536d76031ba94a0b8e78e364815-0",
        ),
    ],
)
def test_generate_image_name(specs, expected):
    """Test that a known image name is generated from given targets."""
    assert MulledImageNameGenerator.generate_image_name(specs) == expected
