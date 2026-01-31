from setuptools import setup, find_packages

with open("requirements.txt") as f:
	install_requires = f.read().strip().split("\n")

setup(
	name="megatechtrackers",
	version="1.0.0",
	description="Megatechtrackers access control system for Frappe forms and Grafana reports",
	author="Megatechtrackers",
	author_email="support@megatechtrackers.com",
	packages=find_packages(),
	zip_safe=False,
	include_package_data=True,
	install_requires=install_requires
)
