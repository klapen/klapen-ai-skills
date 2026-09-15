def double(value):
    return value * 2


class Formatter:
    def render(self, value):
        if value > 0:
            return f"+{value}"
        return str(value)
