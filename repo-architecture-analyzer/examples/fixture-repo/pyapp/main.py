from helpers import double, Formatter


def main():
    formatter = Formatter()
    for i in range(3):
        print(formatter.render(double(i)))


if __name__ == "__main__":
    main()
