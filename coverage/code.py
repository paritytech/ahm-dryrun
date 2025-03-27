"""
Scan all code files (*.rs) recursively in the given folder and extract our magic strings:
- `Asserts functionality "pallet::extrinsic::functionality"`
- `Asserts storage "pallet::storage::when::assertion"`

The output will be used to populate a CSV map.

Always exclude the `target/` directory.
"""

import os
import re
import sys
import json

def main(dir):
	output_map = {"storage": [], "functionality": []}

	for root, dirs, files in os.walk(dir):
		if "target" in dirs:
			dirs.remove("target")

		for file in files:
			if file.endswith(".rs"):
				scan_file(os.path.join(root, file), dir, output_map)

	return output_map

def scan_file(file_path, root, output_map):
	with open(file_path, "r") as file:
		data = file.read()

	# Fast check to avoid slow regex path
	if not 'Assert' in data:
		return
	
	lines = data.split("\n")

	for line_number, line in enumerate(lines):
		rel_path = f'{os.path.relpath(file_path, root)}:{line_number + 1}'
		abs_path = f'{os.path.abspath(file_path)}:{line_number + 1}'

		line = line.strip().replace("'", '"')
		
		if storage := re.match(r".*Assert storage\s+\"([^\"]+)\".*", line):
			parse_line(storage.group(1), True, rel_path, abs_path, output_map["storage"])

		if functionality := re.match(r".*Assert functionality\s+\"([^\"]+)\".*", line):
			parse_line(functionality.group(1), False, rel_path, abs_path, output_map["functionality"])

def parse_line(line, is_storage, rel_path, abs_path, output_map):
	if is_storage:
		(pallet, storage, when, assertion) = line.strip().split("::")
		output_map.append({
			"full_name": f"{pallet}::{storage}::{when}::{assertion}",
			"pallet": pallet,
			"storage": storage,
			"when": when,
			"assertion": assertion,
			"rel_path": rel_path,
			"abs_path": abs_path,
		})
	else:
		(pallet, extrinsic, functionality, assertion) = line.strip().split("::")
		output_map.append({
			"full_name": f"{pallet}::{extrinsic}::{functionality}::{assertion}",
			"pallet": pallet,
			"extrinsic": extrinsic,
			"functionality": functionality,
			"assertion": assertion,
			"rel_path": rel_path,
			"abs_path": abs_path,
		})

if __name__ == "__main__":
	if len(sys.argv) < 2:
		print("Usage: python3 code.py <path-to-source-code>")
		sys.exit(1)

	path_arg = sys.argv[1]
	output = main(path_arg)
	print(json.dumps(output, indent=4))
