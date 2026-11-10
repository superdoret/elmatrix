"""Builds the Python bindings (src/libs/rgbmatrix/*.so) against src/libs/matrix.

Run through `make build`; not meant to be called directly.
"""
import os

from setuptools import Extension, setup

HERE = os.path.dirname(os.path.abspath(__file__))
MATRIX = os.path.join("libs", "matrix")


def ext(name):
    return Extension(
        name="rgbmatrix." + name,
        sources=[os.path.join("libs", "rgbmatrix", name + ".cpp")],
        include_dirs=[os.path.join(MATRIX, "include")],
        library_dirs=[os.path.join(MATRIX, "lib")],
        libraries=["rgbmatrix"],
        extra_compile_args=["-O3", "-Wall"],
        language="c++",
    )


setup(
    name="rgbmatrix",
    version="0.0.1",
    ext_modules=[ext("core"), ext("graphics")],
    packages=["rgbmatrix"],
    package_dir={"rgbmatrix": os.path.join("libs", "rgbmatrix")},
)
