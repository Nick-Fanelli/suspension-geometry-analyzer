# Suspension Geometry Analyzer

An open-source **suspension geometry and kinematics analyzer** for **double wishbone suspension systems**, designed to calculate and visualize key suspension characteristics such as camber gain, caster gain, bump steer, roll center movement, and more.

## Live Demo

Try the application online:

https://nick-fanelli.github.io/suspension-geometry-analyzer/

---

## Authors

**Nick Fanelli** & **Marina Greer**

---

## Acknowledgements

This project was inspired by the work of **spooky-simon**.

Special thanks to **MathWorks** and **Firgelli Automations** for providing excellent technical documentation, mathematical references, and engineering resources that helped guide the development of this project.

---

## Units

| Category | Unit |
|----------|------|
| **Input** | Inches (`in`) |
| **Output** | Inches (`in`) & Degrees (`°`) |
| **Internal Calculations** | Millimeters (`mm`) |

Although the application accepts **inches** for convenience, all calculations are performed internally using **millimeters** to improve numerical precision and consistency.

If you'd like to use different units, you can easily modify the `inToMM()` and `mmToInches()` conversion functions after forking the repository.

---

## License

This project is open source. Feel free to fork, modify, and contribute.